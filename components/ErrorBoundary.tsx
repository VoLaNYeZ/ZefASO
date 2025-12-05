import { ReactNode } from 'react';
import { ErrorBoundary as ReactErrorBoundary, FallbackProps } from 'react-error-boundary';
import { AlertTriangle, RefreshCw } from 'lucide-react';

/**
 * Issue 2.1 FIX: Global Error Boundary using react-error-boundary
 * Catches React render errors and shows a friendly error screen
 */

function ErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white p-8">
            <div className="text-center max-w-md">
                <AlertTriangle className="mx-auto mb-4 text-amber-500" size={64} />
                <h1 className="text-2xl font-bold mb-2">Something went wrong</h1>
                <p className="text-slate-400 mb-6">
                    The app encountered an unexpected error. Please reload to continue.
                </p>
                {error && (
                    <p className="text-xs text-slate-500 mb-4 font-mono bg-slate-800 p-2 rounded">
                        {error.message}
                    </p>
                )}
                <button
                    onClick={resetErrorBoundary}
                    className="px-6 py-3 bg-indigo-600 rounded-lg font-bold flex items-center gap-2 mx-auto hover:bg-indigo-700 transition-colors"
                >
                    <RefreshCw size={18} /> Try Again
                </button>
            </div>
        </div>
    );
}

interface ErrorBoundaryProps {
    children: ReactNode;
}

export function ErrorBoundary({ children }: ErrorBoundaryProps) {
    return (
        <ReactErrorBoundary
            FallbackComponent={ErrorFallback}
            onReset={() => window.location.reload()}
        >
            {children}
        </ReactErrorBoundary>
    );
}
