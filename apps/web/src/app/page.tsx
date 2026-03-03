export default function Home() {
  return (
    <main style={{
      background: '#030608',
      color: '#c8d8c0',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'serif',
      textAlign: 'center',
      gap: '16px'
    }}>
      <h1 style={{ fontSize: '48px', letterSpacing: '8px', opacity: 0.8 }}>
        H·U·M·A
      </h1>
      <p style={{ fontStyle: 'italic', opacity: 0.4, fontSize: '14px' }}>
        né du vide · nourri par l'humanité
      </p>
      <div style={{
        width: '8px', height: '8px', borderRadius: '50%',
        background: '#3dd68c',
        boxShadow: '0 0 20px #3dd68c',
        animation: 'pulse 2s infinite'
      }} />
      <p style={{ opacity: 0.2, fontSize: '10px', letterSpacing: '3px' }}>
        EN GESTATION
      </p>
    </main>
  )
}
