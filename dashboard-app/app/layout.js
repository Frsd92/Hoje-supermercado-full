import './globals.css';
import Providers from './providers';

export const metadata = {
  title: 'Hoje Supermercado | Dashboard',
  description: 'Dashboard do cliente com login Google',
  icons: {
    icon: '/logo-hj.webp',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
