import { useEffect, useState } from 'react'

type Health = { status: string; uptime?: number }

function App() {
  const [count, setCount] = useState(0)
  const [health, setHealth] = useState<Health | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const apiBase = import.meta.env.VITE_API_URL ?? '/api'
    fetch(`${apiBase}/health`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setHealth)
      .catch((e: Error) => setError(e.message))
  }, [])

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 dark:bg-slate-950 dark:text-slate-100">
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-4xl font-semibold tracking-tight">marketplace-example</h1>
        <p className="mt-2 text-slate-500 dark:text-slate-400">
          Vite + React + Tailwind 4 ⟶ NestJS ⟶ Postgres
        </p>

        <section className="mt-10 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-lg font-medium">Backend health</h2>
          {error && <p className="mt-2 text-sm text-red-600">Error: {error}</p>}
          {!error && !health && <p className="mt-2 text-sm text-slate-500">Loading…</p>}
          {health && (
            <pre className="mt-2 overflow-x-auto rounded-md bg-slate-100 p-3 text-sm dark:bg-slate-800">
              {JSON.stringify(health, null, 2)}
            </pre>
          )}
        </section>

        <button
          type="button"
          onClick={() => setCount((c) => c + 1)}
          className="mt-8 inline-flex items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
        >
          Count is {count}
        </button>
      </main>
    </div>
  )
}

export default App
