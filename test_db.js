const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.message.findMany({ orderBy: { createdAt: 'desc' }, take: 10 }).then(res => {
    console.log(res);
}).finally(() => {
    prisma.$disconnect();
});
