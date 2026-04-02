import { createApiClient } from './src/api/client.js';
import { streamMessages } from './src/api/stream.js';

async function main() {
  const client = createApiClient();
  const prompt = process.argv[2] || '用一句话介绍你自己';
  const model = process.env.ANTHROPIC_MODEL || 'glm-5-turbo';

  console.log(`\n你说: ${prompt}\n`);
  process.stdout.write('Claude: ');

  for await (const event of streamMessages(client, [
    { role: 'user', content: prompt }
  ], [], { model })) {
    switch (event.type) {
      case 'text_delta':
        process.stdout.write(event.text);
        break;
      case 'usage':
        console.log(`\n\n[Tokens: ${event.input_tokens} in / ${event.output_tokens} out]`);
        break;
    }
  }
}

main().catch(console.error);
