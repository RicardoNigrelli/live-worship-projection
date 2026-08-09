import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting Seeder...');

  // 1. Limpiar base de datos
  console.log('Limpiando base de datos...');
  await prisma.serviceItem.deleteMany();
  await prisma.deckSlide.deleteMany();
  await prisma.deck.deleteMany();
  await prisma.mediaAsset.deleteMany();
  await prisma.songPart.deleteMany();
  await prisma.song.deleteMany();
  await prisma.bibleVerse.deleteMany();
  await prisma.service.deleteMany();

  // 2. Crear Canciones
  console.log('Creando canciones...');
  const song1 = await prisma.song.create({
    data: {
      title: 'Luz Eterna',
      author: 'Grupo Ejemplo',
      themeBgType: 'COLOR',
      themeBgValue: '#000000',
      parts: {
        create: [
          { type: 'ESTROFA', order: 1, content: 'Una luz que guía mi camino\nUna voz que calma mi ansiedad\nEn este lugar encuentro paz\nY renuevo mi esperanza' },
          { type: 'CORO', order: 2, content: 'Eres luz eterna\nEres luz eterna\nBrillas siempre sobre mí' },
          { type: 'PUENTE', order: 3, content: 'No caminamos solos\nSiempre hay una mano que sostiene' }
        ]
      }
    }
  });

  const song2 = await prisma.song.create({
    data: {
      title: 'Canto de Gratitud',
      author: 'Ana Torres',
      parts: {
        create: [
          { type: 'ESTROFA', order: 1, content: 'Con gratitud levanto mi voz\nCon alegría canto hoy\nEste es un nuevo amanecer\nLleno de esperanza y bien' },
          { type: 'CORO', order: 2, content: 'Gracias por este día\nGracias por tu compañía\nY todos lo verán\nCanto de gratitud' }
        ]
      }
    }
  });

  // 3. Crear Pasaje Bíblico
  console.log('Creando pasajes bíblicos...');
  const verse = await prisma.bibleVerse.create({
    data: {
      reference: 'Juan 3:16',
      text: 'Porque de tal manera amó Dios al mundo, que ha dado a su Hijo unigénito, para que todo aquel que en él cree, no se pierda, mas tenga vida eterna.'
    }
  });

  // 4. Crear un Deck (Diapositiva personalizada)
  console.log('Creando decks...');
  const deck = await prisma.deck.create({
    data: {
      title: 'Avisos Semanales',
      slides: {
        create: [
          { order: 1, text: '¡Bienvenidos a Casa!', layout: 'CENTER', bgColor: '#1a202c' },
          { order: 2, text: 'Reunión de Jóvenes\nSábado 19:00hs', layout: 'CENTER', bgColor: '#2b6cb0' }
        ]
      }
    }
  });

  // 5. Crear Culto de Prueba
  console.log('Creando servicio de prueba...');
  const today = new Date();
  // próximo domingo
  today.setDate(today.getDate() + ((7 - today.getDay()) % 7));
  
  const service = await prisma.service.create({
    data: {
      name: 'Culto Principal',
      date: today,
    }
  });

  // 6. Asociar items al culto
  console.log('Agregando items al servicio...');
  await prisma.serviceItem.createMany({
    data: [
      { serviceId: service.id, type: 'SONG', songId: song1.id, order: 1 },
      { serviceId: service.id, type: 'SONG', songId: song2.id, order: 2 },
      { serviceId: service.id, type: 'VERSE', verseId: verse.id, order: 3 },
      { serviceId: service.id, type: 'MEDIA', deckId: deck.id, order: 4 }, // Custom decks are treated as MEDIA/DECK items in UI
    ]
  });

  console.log('✅ Seeding completado con éxito!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
