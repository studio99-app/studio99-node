// node examples/quickstart.mjs   (after `npm run build`; needs STUDIO99_API_KEY)
import { writeFile } from 'node:fs/promises';
import { Studio99, Studio99Error } from '../dist/index.js';

const s99 = new Studio99();

try {
  const { data, usage } = await s99.generate({
    text: 'shubh vivah',
    language: 'hindi',
    use_case: 'wedding',
    count: 2,
  });

  for (const [i, r] of data.generatedResults.entries()) {
    if (r.svg) {
      await writeFile(`variant-${i + 1}.svg`, r.svg.svgString);
      console.log(`variant-${i + 1}.svg  ${r.fontFamily}  "${r.resultText}"`);
    } else if (r.preview) {
      // Free plan: a watermarked JPG preview instead of SVG.
      await writeFile(`variant-${i + 1}.jpg`, Buffer.from(r.preview.base64, 'base64'));
      console.log(`variant-${i + 1}.jpg  (free-plan preview)`);
    }
  }
  console.log(`Credits left this month: ${usage?.remaining}`);
} catch (e) {
  if (e instanceof Studio99Error) console.error(`${e.code}: ${e.message}`);
  else throw e;
}
