import React from "react";

type Props = {
  markdown: string;
};

export default function MarkdownBackdrop({ markdown }: Props) {
  return (
    <pre className="markdown-backdrop" aria-hidden="true">
      {markdown}
    </pre>
  );
}
