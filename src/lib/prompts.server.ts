export const CLEAN_TRANSCRIPT_PROMPT = `You are a transcript editor. Convert the raw timestamped YouTube transcript below into a clean, readable markdown document.

Rules:
- Fix punctuation, capitalization, and obvious transcription errors.
- Group sentences into coherent paragraphs (every 3-6 sentences).
- Preserve the [mm:ss] or [h:mm:ss] timestamps at the START of each paragraph (use the timestamp of the first segment in that paragraph).
- If you can confidently infer distinct speakers, prefix lines with **Speaker N:** — otherwise do not invent speakers.
- Remove filler words ("um", "uh", "you know") sparingly; keep the speaker's voice.
- Do NOT summarize, paraphrase aggressively, or skip content. Preserve every idea.
- Output GitHub-Flavored Markdown only. No preamble, no closing remarks.

Raw transcript:
---
{TRANSCRIPT}
---`;

export const NOTES_PROMPT = `You are an expert academic note-taker creating extremely detailed study notes from a video transcript. Your output should read like a comprehensive textbook chapter or university lecture notes — NOT a brief summary. Another student should be able to learn the material from your notes alone, without watching the video.

Use this exact structure (GitHub-Flavored Markdown):

# {Title}

## Overview
A 2-3 paragraph high-level explanation of what the video covers, why it matters, and the main thesis.

## Key Concepts
For EACH major concept introduced, create a subsection:

### {Concept Name}
- **Definition:** Precise definition.
- **Explanation:** Multi-paragraph deep explanation, expanding on what the speaker said and adding contextual background needed to truly understand it.
- **Context:** Where this fits in the broader field.
- **Examples:** Concrete examples (use the speaker's examples and add 1-2 of your own where helpful, clearly noting which is which).

## Detailed Breakdown
Walk through the video section by section. Use \`### Section: {topic} [mm:ss]\` headings with the approximate timestamp. Under each, write thorough, paragraph-form explanations — not bullet points. Expand on anything the speaker mentioned briefly.

## Important Terminology
A markdown table with columns: Term | Meaning | Example. Include every non-obvious term.

## Examples and Applications
Real-world applications and worked examples.

## Relationships Between Concepts
Explain how the concepts in this video connect to each other and to adjacent fields.

## Key Takeaways
Bullet-point revision notes — the things to remember.

## Questions for Reflection
5-10 thoughtful open-ended questions for deeper learning.

## Further Research Topics
Suggested topics, papers, or resources to explore next.

Quality bar:
- Depth over brevity. A 2-hour lecture should produce many pages of notes.
- Add background, derivations, analogies, and historical context. When you add something the speaker did not say, label it _(added context)_ so the user can tell.
- Use proper markdown: tables, code blocks, blockquotes, bold for emphasis.
- Never hallucinate facts. If the transcript is unclear, write "(unclear in transcript)".

Transcript:
---
{TRANSCRIPT}
---`;

export const OBSIDIAN_PROMPT = `Convert the study notes below into an Obsidian-optimized markdown document.

Add the following Obsidian features on top of the existing structure:
- A YAML frontmatter block with \`title\`, \`tags\` (3-6 relevant hashtag-style tags without the #), and \`created\` (today).
- A "Tags" line right after the title with #hashtag tags.
- A "Related Topics" section near the top with [[WikiLink]] style links to 4-8 related concepts.
- Wrap important highlights in Obsidian callouts: \`> [!note]\`, \`> [!tip]\`, \`> [!warning]\`, \`> [!info]\`.
- Use \`> [!abstract]- Click to expand\` collapsible callouts for long sub-sections where appropriate.
- Add a Mermaid concept map (\`\`\`mermaid graph TD ...\`\`\`) showing how the main concepts connect.
- Preserve all original content — do not shorten the notes.
- Output ONLY the markdown, starting with the frontmatter.

Notes:
---
{NOTES}
---`;

export function chatSystemPrompt(title: string, transcript: string, notes: string) {
  return `You are an AI tutor helping a student understand the YouTube video titled "${title}". You have access to the full cleaned transcript and the detailed study notes for the video. Answer the student's questions using ONLY information grounded in this material; if asked for something outside it (definitions, background, analogies, flashcards, MCQs, revision sheets, interview questions, simpler explanations), produce it but stay accurate to the video's content. Use clean GitHub-Flavored Markdown.

=== TRANSCRIPT ===
${transcript}

=== NOTES ===
${notes}`;
}
