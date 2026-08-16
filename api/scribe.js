// The Scribe — the game's one server-side seam.
//
// STRATA is a static single-file game. The only reason this function exists is
// that an Anthropic API key must never reach the browser, so anything that talks
// to a model has to talk through here.
//
// Three jobs, all of them flavour laid over content the game already generated:
//
//   chronicle  once per visit to Fendmere, turn a session's numbers into the
//              reeve's ledger. This is the one worth having: it makes the world
//              look like it noticed what you did.
//   contract   given the actual state of the vale — which beacons burn, where you
//              died, which quarter is still black — write the REASON an errand
//              exists. The errand itself is still generated deterministically.
//   gearname   name a rolled trinket from where it was found and what it does,
//              instead of picking two words off a list.
//
// Everything here is optional. With no ANTHROPIC_API_KEY set the endpoint answers
// 503 and the game falls back to its hand-authored text, unchanged. Nothing in the
// game ever waits on this to keep playing.

const MODEL_FOR = {
  // The chronicle runs once per town visit and is the only one anybody reads
  // closely, so it gets the better model. The other two are short and frequent.
  chronicle: 'claude-sonnet-5',
  contract:  'claude-haiku-4-5-20251001',
  gearname:  'claude-haiku-4-5-20251001',
};
const TOKENS_FOR = { chronicle: 420, contract: 160, gearname: 40 };

const VOICE = `You write for STRATA, a lamplighter's game. The vale is dark and
Fendmere pays a lamplighter to push the light outward. Tone: plain, dry, a little
grim, English and rural — closer to a parish record than to high fantasy. Never
cheerful. Never use the words: adventurer, hero, quest, epic, journey, embark,
brave, destiny. No emoji, no markdown, no lists, no headings, no quotation marks
around the whole reply. Write only the text asked for and nothing else.`;

const PROMPTS = {
  chronicle: (d) => `Write the Reeve of Fendmere's ledger entry for the lamplighter
who has just come in off the road. Second person, addressed to them as "you".
Two short paragraphs, 60-90 words total.

Work from these facts and invent nothing that contradicts them. Do not simply list
them back — notice one or two and let the rest sit in the background. If a number
is zero or absent, do not mention it at all.

${JSON.stringify(d, null, 1)}

If they lit nothing and killed nothing, say so plainly and without scolding.`,

  contract: (d) => `Write the reason Fendmere is posting this piece of work. One
sentence, 18-30 words, in the reeve's voice. State a concrete reason grounded in
the facts below — someone's livelihood, a road nobody will use after dark, a thing
seen twice near the fence. Do not restate the task mechanically.

${JSON.stringify(d, null, 1)}`,

  gearname: (d) => `Name this trinket. Two to five words. It should sound like a
thing a person made or wore, tied to where it was found or what it does. No
articles at the start, no punctuation, no explanation — the name only.

${JSON.stringify(d, null, 1)}`,
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const key = process.env.ANTHROPIC_API_KEY;
  // Not an error worth logging loudly — the game is expected to run without it.
  if (!key) return res.status(503).json({ error: 'scribe offline' });

  let body = req.body;
  if (typeof body === 'string'){ try { body = JSON.parse(body); } catch { body = null; } }
  const kind = body && body.kind;
  if (!PROMPTS[kind]) return res.status(400).json({ error: 'unknown kind' });

  // The data is game state this server rendered from the client's own save. Cap it
  // so a malformed or hostile payload cannot turn into an expensive prompt.
  const data = body.data && typeof body.data === 'object' ? body.data : {};
  const payload = JSON.stringify(data);
  if (payload.length > 4000) return res.status(413).json({ error: 'too much state' });

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 12000);
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: ctl.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL_FOR[kind],
        max_tokens: TOKENS_FOR[kind],
        system: VOICE,
        messages: [{ role: 'user', content: PROMPTS[kind](data) }],
      }),
    });
    if (!r.ok){
      const detail = await r.text().catch(() => '');
      return res.status(502).json({ error: 'upstream', status: r.status, detail: detail.slice(0, 300) });
    }
    const j = await r.json();
    const text = (j.content || [])
      .filter(c => c.type === 'text').map(c => c.text).join('').trim();
    if (!text) return res.status(502).json({ error: 'empty' });
    // Cache-Control is deliberately absent: every reply is specific to one save.
    return res.status(200).json({ text });
  } catch (e) {
    const aborted = e && e.name === 'AbortError';
    return res.status(aborted ? 504 : 500).json({ error: aborted ? 'timeout' : 'failed' });
  } finally {
    clearTimeout(timer);
  }
}
