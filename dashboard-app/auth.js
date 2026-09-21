import GoogleProvider from 'next-auth/providers/google';

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
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.name = user.name;
      }
      return token;
    },
    async session({ session, token }) {
      if (session?.user) {
        session.user.id = token.id;
        session.user.email = token.email || session.user.email;
        session.user.name = token.name || session.user.name;
      }
      return session;
    },
  },
};
