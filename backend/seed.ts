import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log("Limpiando DB...");
  await prisma.serviceItem.deleteMany();
  await prisma.song.deleteMany();
  await prisma.service.deleteMany();

  console.log("Creando canciones de prueba...");
  const s1 = await prisma.song.create({
    data: {
      title: "Mar de Fe",
      author: "Marcos Iglesias",
      category: "Adoración",
      parts: {
        create: [
          { type: 'ESTROFA', order: 1, content: "Tu voz resuena en la distancia\nUn faro en medio de la niebla\nCamino firme hacia adelante" },
          { type: 'ESTROFA', order: 2, content: "En la tormenta encuentro calma\nEn el silencio hallo mi guía\nMi alma descansará" },
          { type: 'CORO', order: 3, content: "Tu nombre cantaré\nMás allá del horizonte miraré\nSi las olas crecen, tú eres mi paz" }
        ]
      }
    }
  });

  const s2 = await prisma.song.create({
    data: {
      title: "Palabras de Bien",
      author: "Julia Fernandez",
      category: "Bendición",
      parts: {
        create: [
          { type: 'ESTROFA', order: 1, content: "Que la paz te acompañe\nY te sostenga\nQue la luz ilumine\nCada paso que des" },
          { type: 'CORO', order: 2, content: "Amén, Amén, Amén" },
          { type: 'PUENTE', order: 3, content: "Que el bien te acompañe\nPor muchas generaciones\nTu familia, y tus hijos\nY los hijos de tus hijos" }
        ]
      }
    }
  });

  const s3 = await prisma.song.create({
    data: {
      title: "Celebración",
      author: "Grupo Ejemplo",
      category: "Alabanza",
      parts: {
        create: [
          { type: 'ESTROFA', order: 1, content: "Lo que se vive en comunidad\nSe celebra en unidad\nJuntos alzamos la voz\nJuntos compartimos la alegría" },
          { type: 'CORO', order: 2, content: "Hay celebración, hay celebración\nHay celebración hoy aquí\nHay celebración, hay celebración\nNadie se quiere quedar afuera" }
        ]
      }
    }
  });

  console.log("Creando culto de prueba...");
  const service = await prisma.service.create({
    data: {
      name: "Domingo por la Mañana (Demo)",
      date: new Date()
    }
  });

  // Attach a couple of items to the service
  await prisma.serviceItem.create({
    data: {
      serviceId: service.id,
      order: 1,
      type: "SONG",
      songId: s3.id
    }
  });
  
  await prisma.serviceItem.create({
    data: {
      serviceId: service.id,
      order: 2,
      type: "SONG",
      songId: s1.id
    }
  });

  console.log("Seed completado exitosamente! Servicio ID:", service.id);
}

main().catch(e => console.error(e)).finally(() => prisma.$disconnect());
