import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_PATH = path.join(__dirname, 'config.json');

// Mock data as fallback
const MOCK_PRODUCTS = [
  { id: 'prod_1', title: 'Camiseta Headless (Mock)', description: 'Una camiseta muy cómoda para programar.', price: 25.00, currency: 'USD' },
  { id: 'prod_2', title: 'Gorra Multicore (Mock)', description: 'Protégete del sol con estilo.', price: 15.50, currency: 'USD' }
];

async function getConfig() {
  try {
    const data = await fs.readFile(CONFIG_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    return { activeEngine: 'mock', medusaUrl: 'http://localhost:9000' };
  }
}

// GraphQL Schema
const typeDefs = `#graphql
  type Product {
    id: ID!
    title: String!
    description: String
    price: Float!
    currency: String!
  }

  type Config {
    activeEngine: String!
    medusaUrl: String!
  }

  type Query {
    products: [Product]
    product(id: ID!): Product
    config: Config
  }

  type Mutation {
    updateConfig(activeEngine: String!, medusaUrl: String!): Config
  }
`;

// Resolvers
const resolvers = {
  Query: {
    config: async () => {
      return await getConfig();
    },
    products: async () => {
      const config = await getConfig();
      if (config.activeEngine === 'medusa') {
        try {
          const res = await fetch(`${config.medusaUrl}/store/products`);
          if (!res.ok) throw new Error('Medusa error status: ' + res.status);
          const data = await res.json();
          return data.products.map((p) => {
            const price = p.variants?.[0]?.prices?.[0]?.amount 
              ? p.variants[0].prices[0].amount / 100 
              : 29.99;
            return {
              id: p.id,
              title: p.title,
              description: p.description || 'Sin descripción',
              price,
              currency: 'USD'
            };
          });
        } catch (error) {
          console.warn('Fallo conexión con Medusa, usando Mock:', error.message);
          return MOCK_PRODUCTS;
        }
      }
      return MOCK_PRODUCTS;
    },
    product: async (_, { id }) => {
      const config = await getConfig();
      if (config.activeEngine === 'medusa') {
        try {
          const res = await fetch(`${config.medusaUrl}/store/products/${id}`);
          if (!res.ok) throw new Error('Medusa error status: ' + res.status);
          const data = await res.json();
          const p = data.product;
          const price = p.variants?.[0]?.prices?.[0]?.amount 
            ? p.variants[0].prices[0].amount / 100 
            : 29.99;
          return {
            id: p.id,
            title: p.title,
            description: p.description || 'Sin descripción',
            price,
            currency: 'USD'
          };
        } catch (error) {
          console.warn('Fallo conexión con Medusa para producto, usando Mock:', error.message);
        }
      }
      return MOCK_PRODUCTS.find(p => p.id === id) || {
        id,
        title: 'Producto no encontrado',
        description: '',
        price: 0,
        currency: 'USD'
      };
    }
  },
  Mutation: {
    updateConfig: async (_, { activeEngine, medusaUrl }) => {
      const newConfig = { activeEngine, medusaUrl };
      await fs.writeFile(CONFIG_PATH, JSON.stringify(newConfig, null, 2), 'utf-8');
      console.log('Configuración de motor actualizada:', newConfig);
      return newConfig;
    }
  }
};

const server = new ApolloServer({
  typeDefs,
  resolvers,
});

const { url } = await startStandaloneServer(server, {
  listen: { port: 4000 },
});

console.log(`🚀 API Gateway GraphQL listo en ${url}`);
