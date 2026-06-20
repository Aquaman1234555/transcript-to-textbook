export const CLEAN_TRANSCRIPT_PROMPT = `You are a transcript editor and translator. Convert the raw timestamped YouTube transcript below into a clean, readable markdown document IN ENGLISH.

Rules:
- If the transcript is not in English (e.g. Hindi, Hinglish, Spanish, etc.), TRANSLATE it faithfully into natural, fluent English. Do not transliterate — translate the meaning.
- If the transcript is already in English, just clean it up.
- Fix punctuation, capitalization, and obvious transcription errors.
- Group sentences into coherent paragraphs (every 3-6 sentences).
- Preserve the [mm:ss] or [h:mm:ss] timestamps at the START of each paragraph (use the timestamp of the first segment in that paragraph).
- If you can confidently infer distinct speakers, prefix lines with **Speaker N:** — otherwise do not invent speakers.
- Remove filler words ("um", "uh", "you know", "matlab", "yaani") sparingly; keep the speaker's voice.
- Do NOT summarize, paraphrase aggressively, or skip content. Preserve every idea.
- Output GitHub-Flavored Markdown only. No preamble, no closing remarks. Final output MUST be in English.

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

export const CONCEPT_MAP_PROMPT = `You are a knowledge cartographer. From the study notes below, produce a "Concept Map" layer in GitHub-Flavored Markdown that exposes the *structure* of the ideas — not a re-summary.

Use this exact structure:

# Concept Map

## Diagram
A single Mermaid diagram that visualizes how the main concepts connect. Use a \`graph TD\` (top-down) flowchart. Rules:
- Wrap it in a \`\`\`mermaid fenced code block.
- Use concise node labels (2-5 words). Give every node a short id (e.g. \`A["Energy"]\`).
- Use labeled edges where the relationship matters: \`A -->|causes| B\`, \`A -->|depends on| B\`, \`A -->|contrasts with| B\`.
- 8-20 nodes is ideal. Do not cram the whole transcript in.
- Node label text must NOT contain unescaped parentheses, quotes, or pipes — keep labels plain.

## Hierarchy
A nested markdown bullet list showing the concept hierarchy (parent concept → child concepts → sub-points).

## Key Relationships
A markdown table with columns: From | Relationship | To | Why it matters.

## Dependencies
A short list of "to understand X you must first understand Y" prerequisite chains.

Rules:
- Base everything strictly on the notes. Do not invent concepts that are not present.
- Output ONLY the markdown, starting with the \`# Concept Map\` heading.

Notes:
---
{NOTES}
---`;

export const AP_ANALYSIS_PROMPT = `You are applying the "AP Framework" — an analytical lens for reading content deeply (surfacing assumptions, conditioning, motivations, and the deeper human question). You are NOT summarizing the video again.

Below is (1) the AP Framework knowledge base, then (2) the cleaned transcript / notes of a video. Analyze the content THROUGH the framework.

CRITICAL — do not force the framework. Use it only where it genuinely illuminates the material. If the content is a neutral, technical, or shallow topic with little hidden subtext, say so plainly and keep the section short. Fabricated philosophy is worse than an honest "limited deeper subtext here."

Use this exact structure (GitHub-Flavored Markdown), omitting any subsection that genuinely does not apply (and note when you omit one):

# AP Framework Analysis

> A short (1-2 sentence) note on how deeply this lens applies to THIS particular video, and why.

## Underlying Assumptions
The unstated economic/psychological/social/cultural premises the speaker treats as obvious. Quote or paraphrase the moment, then name the assumption.

## Mental Conditioning
Biases, inherited beliefs, fear-driven or ego-driven narratives present in the content (the speaker's or the assumed audience's). Be specific and fair — not cynical.

## Psychological Drivers & Human Motivations
The underlying human needs the topic really speaks to (security, belonging, meaning, control, status, freedom...).

## Truth vs Information — Layered Reading
For 2-4 of the MOST important ideas in the video, classify and explain across the layers: **Information → Knowledge → Insight → Wisdom**. Only go as far up the ladder as the content actually supports; stop early and say so when it does not reach insight/wisdom.

## Surface Layer vs Deep Layer
A markdown table with columns: Idea | Surface (what is said) | Deep (why / assumption / implication).

## Fundamental Questions
The root-cause questions this topic raises: Why does this matter? What human problem is being solved? What deeper need is involved?

## Potential Blind Spots
What the framing omits or could mislead about.

## Wisdom Insights
The genuine, hard-won takeaways about how to think or live — ONLY if the content earns them. If it does not, write "Not applicable for this material." and stop.

Rules:
- Ground every point in the actual content; do not hallucinate views the speaker did not express.
- Clearly separate the speaker's position from your analytical inference.
- Output ONLY the markdown, starting with \`# AP Framework Analysis\`.

=== AP FRAMEWORK KNOWLEDGE BASE ===
{FRAMEWORK}

=== CONTENT ===
{NOTES}
---`;

export const KNOWLEDGE_EXPANSION_PROMPT = `You are a research companion expanding a student's understanding BEYOND what the video covered. Everything you write here is AI-contributed enrichment, so label it as such.

Use this exact structure (GitHub-Flavored Markdown):

# Knowledge Expansion

> [!info] Everything in this section is AI-generated enrichment, not stated in the video. Verify before citing.

## Historical Context
How this topic / these ideas developed over time; key figures and turning points.

## Scientific / Theoretical Background
Deeper background, mechanisms, derivations, or theory the video assumed or skipped.

## Related Concepts
Adjacent concepts worth learning next, each with a one-line "why it connects".

## Contrasting Viewpoints
Credible alternative or opposing positions to what the video argues, presented fairly.

## Going Deeper
Suggested books, papers, thinkers, or search terms for further study.

Rules:
- Be accurate and concrete. Do not invent fake citations, fake studies, or fake quotes. If unsure, describe the idea generally instead of attributing it falsely.
- Stay relevant to the video's actual topic.
- Output ONLY the markdown, starting with \`# Knowledge Expansion\`.

Video notes (for topic grounding):
---
{NOTES}
---`;

export function chatSystemPrompt(
  title: string,
  transcript: string,
  notes: string,
  apAnalysis?: string,
) {
  return `You are an AI tutor, philosopher, and learning companion helping a student deeply understand the YouTube video titled "${title}". You have the full cleaned transcript, the detailed study notes, and an AP Framework analysis (a lens for assumptions, conditioning, motivations, and deeper meaning).

Answer using information grounded in this material. When asked to explain like a teacher or to a beginner, to challenge or compare the speaker's argument, or to generate flashcards, MCQs, revision sheets, or interview questions, do so — staying accurate to the video's content. When a question invites deeper inquiry, draw on the AP Framework analysis to reveal assumptions and deeper layers, but never force philosophy where it does not fit. Use clean GitHub-Flavored Markdown.

=== TRANSCRIPT ===
${transcript}

=== NOTES ===
${notes}${
    apAnalysis
      ? `

=== AP FRAMEWORK ANALYSIS ===
${apAnalysis}`
      : ""
  }`;
}
