#!/usr/bin/env python3
"""
Artifact probe scorer: reimplements Factory's probe-based evaluation
methodology from their Dec 2025 paper.

Runs four probe types against compressed memory and scores each
on six dimensions using an LLM judge (same methodology as Factory).
Produces a score table you can compare directly against their
published baselines:
  Factory: 2.45  Anthropic: 2.33  OpenAI: 2.19

Usage:
  python score_artifacts.py \
    --memory  .factory/memories.md \
    --original .factory/memories_original.md \
    --model gpt-4o

Requires OPENAI_API_KEY in environment.
"""

import argparse
import json
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

# add example root to path
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))


#probe definitions — these follow Factory's published methodology and are used to generate prompts for both the agent and the judge.
ProbeType = Literal["recall", "artifact", "continuation", "decision"]

# these probe templates are constructed from Factory's published methodology.
# each probe is generated from the pre-compression context and tests
# whether the compressed memory supports the answer.
PROBE_TEMPLATES: dict[ProbeType, str] = {
    "recall": (
        "Based only on the following compressed memory, answer this question:\n"
        "{question}\n\n"
        "Memory:\n{memory}"
    ),
    "artifact": (
        "Based only on the following compressed memory, list all files "
        "that were created, modified, or examined, with a brief note on what changed:\n\n"
        "Memory:\n{memory}"
    ),
    "continuation": (
        "Based only on the following compressed memory, what should the "
        "next step be to continue this task?\n\n"
        "Memory:\n{memory}"
    ),
    "decision": (
        "Based only on the following compressed memory, what decisions were "
        "made and what was the reasoning behind each?\n\n"
        "Memory:\n{memory}"
    ),
}

# LLM judge prompt follows Factory's MT-Bench-style methodology.
# judge is blinded: it does not know which compression method produced the memory.
JUDGE_PROMPT = """
You are evaluating the quality of an AI agent's response after context compression.
Score the response on each dimension from 0 to 5.

Probe type: {probe_type}
Probe question: {question}
Compressed memory shown to agent: {memory}
Agent response: {response}
Ground truth (from original uncompressed memory): {ground_truth}

Score each dimension:
- accuracy:          Is the information factually correct? (0=wrong, 5=perfect)
- context_awareness: Does it show awareness of the full task context? (0=none, 5=full)
- artifact_trail:    Are file paths, functions, endpoints preserved? (0=none, 5=complete)
- completeness:      Are all relevant details included? (0=missing most, 5=complete)
- continuity:        Could work continue from this response? (0=no, 5=yes seamlessly)
- instruction_follow:Did it answer what was asked? (0=ignored, 5=perfectly)

Respond ONLY with valid JSON in this exact format:
{{
  "accuracy": <0-5>,
  "context_awareness": <0-5>,
  "artifact_trail": <0-5>,
  "completeness": <0-5>,
  "continuity": <0-5>,
  "instruction_follow": <0-5>,
  "reasoning": "<one sentence explaining the artifact_trail score>"
}}
""".strip()


@dataclass
class ProbeScore:
    probe_type: ProbeType
    accuracy: float
    context_awareness: float
    artifact_trail: float
    completeness: float
    continuity: float
    instruction_follow: float
    reasoning: str

    @property
    def overall(self) -> float:
        return (
            self.accuracy + self.context_awareness + self.artifact_trail +
            self.completeness + self.continuity + self.instruction_follow
        ) / 6.0




def call_llm(prompt: str, model: str) -> str:
    """Call Mistral via NVIDIA NIM. Returns the response text."""
    import json, urllib.request
    api_key = os.environ["NVIDIA_API_KEY"]
    payload = json.dumps({
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 512,
        "temperature": 0.0,
    }).encode()
    req = urllib.request.Request(
        "https://integrate.api.nvidia.com/v1/chat/completions",
        data=payload,
        headers={
            "Content-Type":  "application/json",
            "Authorization": f"Bearer {api_key}",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read())
    return data["choices"][0]["message"]["content"].strip()


def get_agent_response(probe_type: ProbeType, memory: str, question: str, model: str) -> str:
    """Ask the agent a probe question given only the compressed memory."""
    prompt = PROBE_TEMPLATES[probe_type].format(memory=memory, question=question)
    return call_llm(prompt, model)


def judge_response(
    probe_type: ProbeType,
    question: str,
    memory: str,
    response: str,
    ground_truth: str,
    model: str,
) -> ProbeScore:
    """Score one probe response using the LLM judge."""
    prompt = JUDGE_PROMPT.format(
        probe_type=probe_type,
        question=question,
        memory=memory,
        response=response,
        ground_truth=ground_truth,
    )
    raw = call_llm(prompt, model)

    # strip markdown fences if the model adds them
    raw = raw.replace("```json", "").replace("```", "").strip()
    scores = json.loads(raw)

    return ProbeScore(
        probe_type=probe_type,
        accuracy=scores["accuracy"],
        context_awareness=scores["context_awareness"],
        artifact_trail=scores["artifact_trail"],
        completeness=scores["completeness"],
        continuity=scores["continuity"],
        instruction_follow=scores["instruction_follow"],
        reasoning=scores.get("reasoning", ""),
    )




def generate_probes(original_memory: str, model: str) -> dict[ProbeType, str]:
    """
    Generate one probe question per type from the original memory.
    These questions reference specific facts that should survive compression.
    """
    prompt = (
        "Given this memory file from an AI coding agent session, generate "
        "one specific probe question for each category. Each question must "
        "reference a concrete detail (file name, error, decision) that appears "
        "in the memory.\n\n"
        f"Memory:\n{original_memory}\n\n"
        "Respond ONLY with valid JSON:\n"
        "{\n"
        '  "recall":       "<specific factual question>",\n'
        '  "artifact":     "Which files were modified and how?",\n'
        '  "continuation": "<what should happen next question>",\n'
        '  "decision":     "<what was decided and why question>"\n'
        "}"
    )
    raw = call_llm(prompt, model)
    raw = raw.replace("```json", "").replace("```", "").strip()
    return json.loads(raw)




def run_evaluation(
    compressed_memory: str,
    original_memory: str,
    model: str,
) -> list[ProbeScore]:
    """
    Full probe evaluation pipeline.
    Returns one ProbeScore per probe type.
    """
    print("generating probes from original memory...")
    probes = generate_probes(original_memory, model)

    scores = []
    for probe_type, question in probes.items():
        print(f"running {probe_type} probe...")

        # agent answers from compressed memory only
        response = get_agent_response(probe_type, compressed_memory, question, model)

        # judge scores against ground truth from original
        score = judge_response(
            probe_type=probe_type,
            question=question,
            memory=compressed_memory,
            response=response,
            ground_truth=original_memory,
            model=model,
        )
        scores.append(score)
        print(f"  {probe_type}: overall={score.overall:.2f}  artifact={score.artifact_trail:.2f}")

    return scores


def print_results(scores: list[ProbeScore]):
    """Print results table comparable to Factory's published numbers."""
    print("\njeval Probe Evaluation Results")
    print(f"{'probe':<15} {'overall':>8} {'accuracy':>9} {'artifact':>9} {'continuity':>11}")
    print("-" * 56)

    for s in scores:
        print(
            f"{s.probe_type:<15} {s.overall:>8.2f} "
            f"{s.accuracy:>9.2f} {s.artifact_trail:>9.2f} "
            f"{s.continuity:>11.2f}"
        )

    avg_overall  = sum(s.overall for s in scores) / len(scores)
    avg_artifact = sum(s.artifact_trail for s in scores) / len(scores)
    print("-" * 56)
    print(f"{'AVERAGE':<15} {avg_overall:>8.2f} {'':>9} {avg_artifact:>9.2f}")
    print()
    print("Factory baseline — overall: 3.70  artifact: 2.45")
    print("OpenAI baseline  — overall: 3.35  artifact: 2.19")
    print()
    delta = avg_artifact - 2.45
    print(f"jeval artifact delta vs Factory: {delta:+.2f}")


def main():
    parser = argparse.ArgumentParser(description="Run Factory-style probe evaluation on compressed memory")
    parser.add_argument("--memory",   required=True, help="path to compressed memories.md")
    parser.add_argument("--original", required=True, help="path to original memories.md before compression")
    parser.add_argument("--model",    default="gpt-4o", help="LLM judge model")
    parser.add_argument("--out",      default=None, help="optional path to save scores as JSON")
    args = parser.parse_args()

    compressed = Path(args.memory).read_text(encoding="utf-8")
    original   = Path(args.original).read_text(encoding="utf-8")

    scores = run_evaluation(compressed, original, args.model)
    print_results(scores)

    if args.out:
        data = [
            {
                "probe_type":        s.probe_type,
                "overall":           s.overall,
                "accuracy":          s.accuracy,
                "context_awareness": s.context_awareness,
                "artifact_trail":    s.artifact_trail,
                "completeness":      s.completeness,
                "continuity":        s.continuity,
                "instruction_follow":s.instruction_follow,
                "reasoning":         s.reasoning,
            }
            for s in scores
        ]
        Path(args.out).write_text(json.dumps(data, indent=2))
        print(f"scores saved to {args.out}")


if __name__ == "__main__":
    main()
