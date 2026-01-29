/**
 * Solo専用エントリーポイント
 *
 * SoloPage（Standalone Mode）のみを含む軽量版
 * 独立した静的ファイルとしてデプロイ可能
 */

/* eslint-disable react-refresh/only-export-components */
import { StrictMode, useMemo } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { DIProvider, setupContainer } from './infrastructure/di'
import { SoloPage } from './presentation/components/pages/SoloPage'

function SoloApp() {
  const diContainer = useMemo(() => {
    return setupContainer('standalone');
  }, []);

  return (
    <DIProvider container={diContainer}>
      <SoloPage />
    </DIProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SoloApp />
  </StrictMode>,
)
