# Risk weights live here so neither decomposer nor budget
# has to import from each other — breaks the circular dependency.
RISK_WEIGHTS = {
    "factual_claim":   1.00,
    "causal_chain":    0.95,
    "entity_role":     0.85,
    "temporal_anchor": 0.75,
    "contrastive":     0.70,
    "background":      0.20,
}
