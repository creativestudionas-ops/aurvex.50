'use client'

interface ErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function JudasDemoError({ error, reset }: ErrorProps) {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
      <div className="max-w-md w-full rounded-lg border border-zinc-800 bg-zinc-900/80 p-8 text-center">
        <div className="text-4xl mb-4">&#x26A0;</div>
        <h2 className="font-[Cormorant] text-xl font-bold text-zinc-100 mb-2">
          Dashboard Error
        </h2>
        <p className="text-sm text-zinc-400 mb-6 leading-relaxed">
          Something went wrong loading the Judas &times; SMC Dashboard.
          {error.digest && (
            <span className="block mt-1 font-[Geist_Mono] text-xs text-zinc-600">
              Digest: {error.digest}
            </span>
          )}
        </p>
        <button
          onClick={reset}
          className="rounded-md bg-zinc-800 px-5 py-2.5 text-sm font-medium text-zinc-200 hover:bg-zinc-700 transition-colors border border-zinc-700"
        >
          Try Again
        </button>
      </div>
    </div>
  )
}
