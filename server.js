const express = require('express');
const cors    = require('cors');
const fetch   = (...a) => import('node-fetch').then(({ default: f }) => f(...a));

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => res.json({ status: 'ok', service: 'chibiboy-generator' }));

app.post('/generate', async (req, res) => {
  try {
    const { skin, hair, outfit, accessory, background, gender } = req.body || {};

    if (!skin || !hair || !outfit || !accessory || !background) {
      return res.status(400).json({ error: 'Missing trait fields' });
    }

    const REPLICATE_API_KEY = process.env.REPLICATE_API_KEY;
    if (!REPLICATE_API_KEY) {
      return res.status(500).json({ error: 'Missing REPLICATE_API_KEY env variable on server' });
    }

    const genderWord = gender === 'female' ? 'female girl' : 'male boy';
    const prompt = `Cute chibi anime ${genderWord} character with ${skin}, ${hair}, wearing ${outfit}, with ${accessory}, set in ${background}. Chibi proportions with very large round head and tiny body (3:1 ratio), big expressive glowing purple anime eyes with highlights, black Nike Air Jordan sneakers, purple and cyan energy aura glowing around the body, dark cyberpunk streetwear aesthetic, vibrant neon colors, dramatic rim lighting. High quality anime manga illustration style, masterpiece, ultra detailed.`;

    console.log('✦ Prompt:', prompt);

    const replicateRes = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions', {
      method : 'POST',
      headers: {
        'Authorization': `Bearer ${REPLICATE_API_KEY}`,
        'Content-Type' : 'application/json',
        'Prefer'       : 'wait',
      },
      body: JSON.stringify({
        input: {
          prompt,
          num_outputs        : 1,
          aspect_ratio       : '1:1',
          output_format      : 'png',
          output_quality     : 90,
          num_inference_steps: 4,
        },
      }),
    });

    const replicateText = await replicateRes.text();
    console.log('✦ Replicate response:', replicateText.slice(0, 300));

    let prediction;
    try { prediction = JSON.parse(replicateText); }
    catch (e) { throw new Error('Replicate returned invalid JSON: ' + replicateText.slice(0, 200)); }

    if (!replicateRes.ok) throw new Error(prediction.detail || `Replicate error ${replicateRes.status}`);

    let output = prediction.output;
    let status = prediction.status;

    if (!output && status !== 'failed') {
      for (let i = 0; i < 45; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const poll     = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
          headers: { 'Authorization': `Bearer ${REPLICATE_API_KEY}` },
        });
        const pollData = await poll.json();
        status = pollData.status;
        console.log(`  polling ${i + 1}/45 — ${status}`);
        if (status === 'succeeded') { output = pollData.output; break; }
        if (status === 'failed')    throw new Error('Replicate failed: ' + (pollData.error || 'unknown'));
      }
    }

    if (!output?.[0]) throw new Error('No image returned from Replicate');

    const imgRes = await fetch(output[0]);
    if (!imgRes.ok) throw new Error(`Image fetch error: ${imgRes.status}`);

    const imgBuf = Buffer.from(await imgRes.arrayBuffer());
    console.log('✦ Done! Size:', Math.round(imgBuf.length / 1024), 'KB');

    res.json({
      success: true,
      image  : `data:image/png;base64,${imgBuf.toString('base64')}`,
      prompt,
    });

  } catch (err) {
    console.error('❌', err.message);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Chibiboy server on port ${PORT}`));
