import GoogleProviderModule from 'next-auth/providers/google';
import CredentialsProviderModule from 'next-auth/providers/credentials';
import { verifyErpCredentials } from './features/erp/password.js';

const GoogleProvider = typeof GoogleProviderModule === 'function' ? GoogleProviderModule : GoogleProviderModule.default;
const CredentialsProvider = typeof CredentialsProviderModule === 'function' ? CredentialsProviderModule : CredentialsProviderModule.default;
const hasGoogleConfig = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export const authOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  trustHost: true,
  debug: process.env.NODE_ENV === 'development',
  providers: [
    ...(hasGoogleConfig ? [
      GoogleProvider({
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      }),
    ] : []),
    CredentialsProvider({
      credentials: {
        username: { label: 'Nome de usuário', type: 'text' },
        password: { label: 'Senha', type: 'password' },
      },
      async authorize(credentials) {
        const username = credentials?.username;
        const password = credentials?.password;
        if (typeof username !== 'string' || typeof password !== 'string') return null;

        const isAuthorized = await verifyErpCredentials(username, password);
        if (!isAuthorized) return null;
        const normalizedUsername = username.trim().toLowerCase();
        return { id: normalizedUsername, username: normalizedUsername, name: 'CEO' };
      },
    }),
  ],
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
  },
  callbacks: {
    async redirect({ url, baseUrl }) {
      if (typeof url === 'string' && url.startsWith('/')) return `${baseUrl}${url}`;
      try {
        const allowedOrigins = new Set([baseUrl, 'http://localhost:5500', 'http://127.0.0.1:5500', 'http://localhost:8010']);
        if (typeof url === 'string' && allowedOrigins.has(new URL(url).origin)) return url;
      } catch {
        // Ignora URLs relativas/indevidas e usa o fallback abaixo.
      }
      return `${baseUrl}/dashboard`;
    },
    async jwt({ token, user, account }) {
      if (account) {
        token.erpAccess = account.provider === 'credentials';
        token.erpAccessExpiresAt = token.erpAccess ? Date.now() + 8 * 60 * 60 * 1000 : 0;
        token.authProvider = account.provider;
      } else if (token.erpAccess !== true || typeof token.erpAccessExpiresAt !== 'number' || token.erpAccessExpiresAt <= Date.now()) {
        token.erpAccess = false;
      }
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.name = user.name;
        token.picture = user.image;
        token.erpUsername = user.username;
      }
      return token;
    },
    async session({ session, token }) {
      if (session?.user) {
        session.user.id = token.id;
        session.user.email = token.email || session.user.email;
        session.user.name = token.name || session.user.name;
        session.user.image = token.picture || session.user.image;
        session.user.username = token.erpUsername || null;
        session.user.erpAccess = token.erpAccess === true;
        session.user.erpAccessExpiresAt = token.erpAccessExpiresAt || 0;
      }
      return session;
    },
  },
};
