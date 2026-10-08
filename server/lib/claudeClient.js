import { spawn } from 'child_process';

// Strips a page's HTML down to visible text for the tagging prompt — script
// tags (meta, relationships) shouldn't count as "content" the character/place
// actually says or does.
function stripTags(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractJsonArray(text) {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const arr = JSON.parse(match[0]);
    return Array.isArray(arr) ? arr.filter(v => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

// One-shot (non-streaming) call: given a page and the facet vocabulary,
// returns only `facet:value` tags drawn from that vocabulary that clearly
// apply to the page and aren't hallucinated outside it.
export function suggestFacetTags({ meta, content, registry }) {
  return new Promise((resolve, reject) => {
    const prompt = [
      'You are a tagging assistant for a TTRPG campaign wiki.',
      'You are given a controlled vocabulary of "facets" (categories) and their allowed values, a page\'s metadata, and its content.',
      'Decide which facet:value tags from the vocabulary clearly apply to this page.',
      'Use ONLY facet names and values that appear in the vocabulary below — never invent new facets or values.',
      'If nothing clearly applies, return an empty array.',
      'Respond with ONLY a JSON array of strings in the form "facet:value" (e.g. ["heritage:welsh"]). No prose, no markdown fences.',
      '',
      `Vocabulary: ${JSON.stringify(registry)}`,
      `Page metadata: ${JSON.stringify(meta)}`,
      `Page content: ${stripTags(content).slice(0, 4000)}`,
    ].join('\n');

    const child = spawn('claude', ['-p'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', c => { stdout += c.toString(); });
    child.stderr.on('data', c => { stderr += c.toString(); });

    child.stdin.write(prompt);
    child.stdin.end();

    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(stderr || `claude exited with code ${code}`));

      const valid = new Set();
      for (const [facet, def] of Object.entries(registry)) {
        for (const value of def.values ?? []) valid.add(`${facet}:${value}`);
      }
      resolve(extractJsonArray(stdout).filter(t => valid.has(t)));
    });

    child.on('error', (err) => {
      reject(err.code === 'ENOENT' ? new Error('claude CLI not found. Make sure "claude" is on your PATH.') : err);
    });
  });
}

export function streamEdit({ selectedText, instruction, context, res }) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const systemPrompt =
    'You are a TTRPG content assistant embedded in a markdown editor. ' +
    'The user gives you a piece of their document and an instruction. ' +
    'Return ONLY the replacement text — no preamble, no explanation, no markdown code fences. ' +
    'Preserve any markdown formatting conventions already present in the selection.';

  const userMessage =
    (context ? `Document context (surrounding text — do not modify):\n${context}\n\n---\n` : '') +
    `Selected text to modify:\n${selectedText}\n\nInstruction: ${instruction}`;

  const fullPrompt = `${systemPrompt}\n\nUser:\n${userMessage}`;

  // claude -p reads prompt from stdin and streams response to stdout
  const child = spawn('claude', ['-p'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });

  child.stdin.write(fullPrompt);
  child.stdin.end();

  child.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    res.write(`data: ${JSON.stringify({ text })}\n\n`);
  });

  child.stderr.on('data', (chunk) => {
    console.error('[claude]', chunk.toString());
  });

  child.on('close', (code) => {
    if (code !== 0) {
      res.write(`data: ${JSON.stringify({ error: `claude exited with code ${code}` })}\n\n`);
    }
    res.write('data: [DONE]\n\n');
    res.end();
  });

  child.on('error', (err) => {
    if (err.code === 'ENOENT') {
      res.write(`data: ${JSON.stringify({ error: 'claude CLI not found. Make sure "claude" is on your PATH.' })}\n\n`);
    } else {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    }
    res.write('data: [DONE]\n\n');
    res.end();
  });

  res.on('close', () => {
    if (!child.killed) child.kill();
  });
}
