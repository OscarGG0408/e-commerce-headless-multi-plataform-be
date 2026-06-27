import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';

// Esquema básico inicial
const typeDefs = `#graphql
  type Product {
    id: ID!
    title: String!
    description: String
    price: Float!
    currency: String!
  }

  type Query {
    products: [Product]
    product(id: ID!): Product
  }
`;

// Resolvers simulados por ahora (Fase 1)
const resolvers = {
  Query: {
    products: () => [
      { id: 'prod_1', title: 'Camiseta Headless', description: 'Camiseta de algodón', price: 29.99, currency: 'USD' },
      { id: 'prod_2', title: 'Gorra Multicore', description: 'Gorra ajustable', price: 15.50, currency: 'USD' }
    ],
    product: (_, { id }) => ({
      id,
      title: 'Producto Mock',
      description: 'Prueba de concepto',
      price: 10.00,
      currency: 'USD'
    }),
  },
};

const server = new ApolloServer({
  typeDefs,
  resolvers,
});

const { url } = await startStandaloneServer(server, {
  listen: { port: 4000 },
});

console.log(`🚀 Servidor GraphQL listo en ${url}`);
