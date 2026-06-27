import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_PATH = path.join(__dirname, 'config.json');

// Memory storage for MOCK engine
const MOCK_CARTS = {};
const MOCK_CUSTOMERS = {};
const MOCK_ORDERS = [];
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

  type CartItem {
    id: ID!
    productId: ID!
    title: String!
    price: Float!
    quantity: Int!
  }

  type Cart {
    id: ID!
    items: [CartItem]
    total: Float!
  }

  type Customer {
    id: ID!
    email: String!
  }

  type Order {
    id: ID!
    total: Float!
    status: String!
    items: [CartItem]
  }

  type AuthPayload {
    token: String!
    customer: Customer!
  }

  type Query {
    products: [Product]
    product(id: ID!): Product
    config: Config
    cart(id: ID!): Cart
    customerOrders(email: String!): [Order]
  }

  type Mutation {
    updateConfig(activeEngine: String!, medusaUrl: String!): Config
    createCart: Cart
    addToCart(cartId: ID!, productId: ID!, quantity: Int!): Cart
    registerCustomer(email: String!, password: String!): AuthPayload
    loginCustomer(email: String!, password: String!): AuthPayload
    createOrder(cartId: ID!, email: String!, shippingAddress: String!, paymentMethod: String!): Order
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
    },
    cart: async (_, { id }) => {
      const config = await getConfig();
      if (config.activeEngine === 'medusa') {
        try {
          const res = await fetch(`${config.medusaUrl}/store/carts/${id}`);
          if (res.ok) {
            const data = await res.json();
            const c = data.cart;
            const items = c.items.map((item) => ({
              id: item.id,
              productId: item.product_id,
              title: item.title,
              price: item.unit_price / 100,
              quantity: item.quantity
            }));
            const total = items.reduce((acc, item) => acc + (item.price * item.quantity), 0);
            return { id: c.id, items, total };
          }
        } catch (error) {
          console.warn('Fallo conexión con Medusa para cart, usando Mock:', error.message);
        }
      }
      return MOCK_CARTS[id] || { id, items: [], total: 0 };
    },
    customerOrders: async (_, { email }) => {
      // Retornar órdenes del usuario
      return MOCK_ORDERS.filter(o => o.email === email);
    }
  },
  Mutation: {
    updateConfig: async (_, { activeEngine, medusaUrl }) => {
      const newConfig = { activeEngine, medusaUrl };
      await fs.writeFile(CONFIG_PATH, JSON.stringify(newConfig, null, 2), 'utf-8');
      console.log('Configuración de motor actualizada:', newConfig);
      return newConfig;
    },
    createCart: async () => {
      const config = await getConfig();
      if (config.activeEngine === 'medusa') {
        try {
          const res = await fetch(`${config.medusaUrl}/store/carts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
          });
          if (res.ok) {
            const data = await res.json();
            return { id: data.cart.id, items: [], total: 0 };
          }
        } catch (error) {
          console.warn('Fallo creación de cart en Medusa, usando Mock:', error.message);
        }
      }
      const newId = 'cart_' + Math.random().toString(36).substr(2, 9);
      const newCart = { id: newId, items: [], total: 0 };
      MOCK_CARTS[newId] = newCart;
      return newCart;
    },
    addToCart: async (_, { cartId, productId, quantity }) => {
      const config = await getConfig();
      if (config.activeEngine === 'medusa') {
        try {
          // Agregar item en Medusa
          const res = await fetch(`${config.medusaUrl}/store/carts/${cartId}/line-items`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ variant_id: productId, quantity }) // Medusa usa variant_id
          });
          if (res.ok) {
            const data = await res.json();
            const c = data.cart;
            const items = c.items.map((item) => ({
              id: item.id,
              productId: item.product_id,
              title: item.title,
              price: item.unit_price / 100,
              quantity: item.quantity
            }));
            const total = items.reduce((acc, item) => acc + (item.price * item.quantity), 0);
            return { id: c.id, items, total };
          }
        } catch (error) {
          console.warn('Fallo addToCart en Medusa, usando Mock:', error.message);
        }
      }

      // Lógica de Mock
      const cart = MOCK_CARTS[cartId] || { id: cartId, items: [], total: 0 };
      const product = MOCK_PRODUCTS.find(p => p.id === productId) || { id: productId, title: 'Producto', price: 10 };
      const existing = cart.items.find(i => i.productId === productId);
      if (existing) {
        existing.quantity += quantity;
      } else {
        cart.items.push({
          id: 'item_' + Math.random().toString(36).substr(2, 9),
          productId,
          title: product.title,
          price: product.price,
          quantity
        });
      }
      cart.total = cart.items.reduce((acc, item) => acc + (item.price * item.quantity), 0);
      MOCK_CARTS[cartId] = cart;
      return cart;
    },
    registerCustomer: async (_, { email, password }) => {
      // Registro simple mockeado
      const token = 'token_' + Math.random().toString(36).substr(2, 9);
      const customer = { id: 'cust_' + Math.random().toString(36).substr(2, 9), email };
      MOCK_CUSTOMERS[token] = customer;
      return { token, customer };
    },
    loginCustomer: async (_, { email, password }) => {
      // Login simple mockeado
      const token = 'token_' + Math.random().toString(36).substr(2, 9);
      const customer = { id: 'cust_' + Math.random().toString(36).substr(2, 9), email };
      MOCK_CUSTOMERS[token] = customer;
      return { token, customer };
    },
    createOrder: async (_, { cartId, email, shippingAddress, paymentMethod }) => {
      // Finalizar carrito y crear orden
      const config = await getConfig();
      let total = 0;
      let items = [];

      if (config.activeEngine === 'medusa') {
        try {
          const res = await fetch(`${config.medusaUrl}/store/carts/${cartId}/complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          });
          if (res.ok) {
            const data = await res.json();
            // Retornar orden simulada con datos de Medusa
            const newOrder = {
              id: 'ord_' + Math.random().toString(36).substr(2, 9),
              total: data.order?.total / 100 || 50,
              status: 'completed',
              items: [],
              email
            };
            MOCK_ORDERS.push(newOrder);
            return newOrder;
          }
        } catch (error) {
          console.warn('Fallo checkout en Medusa, usando Mock:', error.message);
        }
      }

      const cart = MOCK_CARTS[cartId];
      if (cart) {
        total = cart.total;
        items = cart.items;
        delete MOCK_CARTS[cartId]; // Limpiar carrito
      }

      const newOrder = {
        id: 'ord_' + Math.random().toString(36).substr(2, 9),
        total,
        status: 'completed',
        items,
        email
      };
      MOCK_ORDERS.push(newOrder);
      return newOrder;
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
