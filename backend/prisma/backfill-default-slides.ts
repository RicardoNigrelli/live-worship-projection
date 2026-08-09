import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Mirrors ensureDefaultSlides() in src/server.ts — every song must start with a
// TITULO slide and end with an empty FINAL slide.
function ensureDefaultSlides(title: string, parts: Array<{ type: string; content: string }>) {
  const result = [...parts];

  if (result[0]?.type === 'TITULO') {
    result[0] = { ...result[0], content: title };
  } else {
    result.unshift({ type: 'TITULO', content: title });
  }

  if (result[result.length - 1]?.type !== 'FINAL') {
    result.push({ type: 'FINAL', content: '' });
  }

  return result.map((p, idx) => ({ type: p.type, content: p.content, order: idx + 1 }));
}

async function main() {
  const songs = await prisma.song.findMany({
    include: { parts: { orderBy: { order: 'asc' } } },
  });

  let updated = 0;
  for (const song of songs) {
    const needsTitle = song.parts[0]?.type !== 'TITULO';
    const needsFinal = song.parts[song.parts.length - 1]?.type !== 'FINAL';
    if (!needsTitle && !needsFinal) continue;

    const finalParts = ensureDefaultSlides(song.title, song.parts.map(p => ({ type: p.type, content: p.content })));

    await prisma.$transaction([
      prisma.songPart.deleteMany({ where: { songId: song.id } }),
      prisma.song.update({
        where: { id: song.id },
        data: { parts: { create: finalParts } },
      }),
    ]);

    updated++;
    console.log(`Actualizada: "${song.title}" (+${needsTitle ? ' título' : ''}${needsFinal ? ' final' : ''})`);
  }

  console.log(`\n✅ Listo. ${updated} de ${songs.length} canciones actualizadas.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
