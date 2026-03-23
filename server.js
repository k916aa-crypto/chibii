const express = require('express');
const cors    = require('cors');
const fetch   = (...a) => import('node-fetch').then(({ default: f }) => f(...a));

const app = express();
app.use(cors());
app.use(express.json());

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.json({ status: 'ok', service: 'chibiboy-generator' }));

// ── POST /generate ────────────────────────────────────────────────────────────
// JSON body: { skin, hair, outfit, accessory, background }
app.post('/generate', async (req, res) => {
  try {
    const { skin, hair, outfit, accessory, background, gender } = req.body || {};

    if (!skin || !hair || !outfit || !accessory || !background) {
      return res.status(400).json({ error: 'Missing trait fields in request body' });
    }

    const HF_TOKEN = process.env.HF_TOKEN;
    if (!HF_TOKEN) {
      return res.status(500).json({ error: 'Missing HF_TOKEN env variable on server' });
    }

    // ── Build prompt from traits ──────────────────────────────────────────────
    const genderWord = gender === 'female' ? 'female girl' : 'male boy';
    const prompt = `Cute chibi anime ${genderWord} character with ${skin}, ${hair}, wearing ${outfit}, with ${accessory}, set in ${background}. Chibi proportions with very large round head and tiny body (3:1 ratio), big expressive glowing purple anime eyes with highlights, black Nike Air Jordan sneakers, purple and cyan energy aura glowing around the body, dark cyberpunk streetwear aesthetic, vibrant neon colors, dramatic rim lighting. High quality anime manga illustration style, masterpiece, ultra detailed.`;

    console.log('✦ Prompt:', prompt);

    // ── Hugging Face Inference API — FLUX.1-schnell (free tier) ──────────────
    const hfRes = await fetch(
      'https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell',
      {
        method : 'POST',
        headers: {
          'Authorization': `Bearer ${HF_TOKEN}`,
          'Content-Type' : 'application/json',
        },
        body: JSON.stringify({
          inputs: prompt,
          parameters: {
            width             : 512,
            height            : 512,
            num_inference_steps: 4,
            guidance_scale    : 0.0,
          },
        }),
      }
    );

    if (!hfRes.ok) {
      const errText = await hfRes.text();
      console.error('HF error:', errText);
      // Handle model loading (503) — tell client to retry
      if (hfRes.status === 503) {
        return res.status(503).json({ error: 'Model is loading, please wait 20 seconds and try again.' });
      }
      // Handle rate limit / credit exceeded (402)
      if (hfRes.status === 402) {
        return res.status(402).json({ error: 'Hugging Face free tier limit reached for this month.' });
      }
      throw new Error(`Hugging Face error ${hfRes.status}: ${errText.slice(0, 200)}`);
    }

    // HF returns the image directly as binary (not JSON)
    const imgBuf = Buffer.from(await hfRes.arrayBuffer());
    console.log('✦ Done! Size:', Math.round(imgBuf.length / 1024), 'KB');

    res.json({
      success: true,
      image  : `data:image/png;base64,${imgBuf.toString('base64')}`,
      prompt,
    });

  } catch (err) {
    console.error('❌ Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Chibiboy server on port ${PORT}`));
