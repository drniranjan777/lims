import { Prisma, PrismaClient } from '@prisma/client';

// Serialise Decimal columns (money, results) as JSON numbers rather than strings.
(Prisma.Decimal.prototype as unknown as { toJSON: () => number }).toJSON = function (this: Prisma.Decimal) {
  return this.toNumber();
};

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

export type Tx = Prisma.TransactionClient;
export { Prisma };
