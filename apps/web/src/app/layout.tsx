export const metadata = {
  title: 'HUMA — L\'IA née de l\'Humanité',
  description: 'Un organisme cognitif distribué né du vide',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fr">
      <body style={{ margin: 0, padding: 0 }}>
        {children}
      </body>
    </html>
  )
}
