import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Groups songs by normalized title+author, keeps one canonical song per group
// (the one used in the most reuniones, tie-broken by most complete lyrics, then oldest),
// reassigns any ServiceItem pointing at a duplicate to the canonical song, then deletes
// the duplicates. Run with no flags for a dry-run report; pass --execute to apply changes.

const EXECUTE = process.argv.includes('--execute');

function normalize(value: string | null | undefined) {
  return (value || '').trim().toLowerCase();
}

async function main() {
  const songs = await prisma.song.findMany({
    include: {
      parts: true,
      _count: { select: { serviceItems: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  const groups = new Map<string, typeof songs>();
  for (const song of songs) {
    const key = `${normalize(song.title)}|${normalize(song.author)}`;
    const group = groups.get(key) || [];
    group.push(song);
    groups.set(key, group);
  }

  const duplicateGroups = Array.from(groups.values()).filter(g => g.length > 1);

  if (duplicateGroups.length === 0) {
    console.log('No se encontraron canciones duplicadas.');
    return;
  }

  console.log(`Encontrados ${duplicateGroups.length} grupos de duplicados.\n`);

  let totalDeleted = 0;
  let totalReassigned = 0;

  for (const group of duplicateGroups) {
    const canonical = [...group].sort((a, b) => {
      if (b._count.serviceItems !== a._count.serviceItems) return b._count.serviceItems - a._count.serviceItems;
      if (b.parts.length !== a.parts.length) return b.parts.length - a.parts.length;
      return a.createdAt.getTime() - b.createdAt.getTime();
    })[0];

    const duplicates = group.filter(s => s.id !== canonical.id);

    console.log(`"${canonical.title}" (${canonical.author || 'Anónimo'})`);
    console.log(`  Canónica: ${canonical.id} — usada en ${canonical._count.serviceItems} reunión(es), ${canonical.parts.length} partes`);
    for (const dup of duplicates) {
      console.log(`  Duplicada: ${dup.id} — usada en ${dup._count.serviceItems} reunión(es), ${dup.parts.length} partes`);
      totalReassigned += dup._count.serviceItems;
    }
    totalDeleted += duplicates.length;

    if (EXECUTE) {
      await prisma.$transaction([
        ...duplicates.map(dup =>
          prisma.serviceItem.updateMany({ where: { songId: dup.id }, data: { songId: canonical.id } })
        ),
        prisma.song.deleteMany({ where: { id: { in: duplicates.map(d => d.id) } } }),
      ]);
    }
    console.log('');
  }

  console.log(`${EXECUTE ? 'Aplicado' : 'Dry-run — nada se modificó'}: ${totalDeleted} canciones duplicadas ${EXECUTE ? 'eliminadas' : 'a eliminar'}, ${totalReassigned} referencias de reunión ${EXECUTE ? 'reasignadas' : 'a reasignar'}.`);
  if (!EXECUTE) {
    console.log('Ejecutá con --execute para aplicar los cambios.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
