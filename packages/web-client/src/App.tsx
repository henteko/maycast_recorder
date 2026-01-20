import { useState } from 'react'
import init, { add, version, log } from '../../wasm-core/pkg/maycast_wasm_core'

function App() {
  const [result, setResult] = useState<number | null>(null)
  const [wasmInitialized, setWasmInitialized] = useState(false)

  const initWasm = async () => {
    try {
      await init()
      setWasmInitialized(true)
      log('WASM module initialized successfully!')
      console.log('WASM version:', version())
    } catch (error) {
      console.error('Failed to initialize WASM:', error)
      alert('Failed to initialize WASM module')
    }
  }

  const testWasm = async () => {
    try {
      if (!wasmInitialized) {
        await initWasm()
      }
      const testResult = add(1, 2)
      setResult(testResult)
      log(`Test successful: 1 + 2 = ${testResult}`)
    } catch (error) {
      console.error('Failed to test WASM:', error)
      alert('Failed to test WASM module')
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full">
        <h1 className="text-3xl font-bold text-gray-800 mb-6 text-center">
          Maycast Recorder
        </h1>

        <div className="mb-6">
          <p className="text-gray-600 text-center mb-4">
            Phase 1A-1: Environment Setup
          </p>

          <div className="space-y-2 text-sm text-gray-500">
            <div className="flex items-center">
              <span className="mr-2">✅</span>
              <span>Cargo Workspace configured</span>
            </div>
            <div className="flex items-center">
              <span className="mr-2">✅</span>
              <span>Common crate created</span>
            </div>
            <div className="flex items-center">
              <span className="mr-2">✅</span>
              <span>WASM core crate created</span>
            </div>
            <div className="flex items-center">
              <span className="mr-2">✅</span>
              <span>Vite + React + Tailwind CSS setup</span>
            </div>
            <div className="flex items-center">
              <span className="mr-2">⏳</span>
              <span>WASM integration (next step)</span>
            </div>
          </div>
        </div>

        <button
          onClick={testWasm}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
        >
          Test WASM: add(1, 2)
        </button>

        {result !== null && (
          <div className="mt-4 p-4 bg-green-100 border border-green-400 rounded-lg">
            <p className="text-green-700 text-center">
              WASM Result: 1 + 2 = {result}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
