import { useState, useEffect, useCallback } from 'react'
import { ChunkStorage, listAllSessions } from '../storage/chunk-storage'
import type { SessionMetadata } from '../storage/types'

export const useSessionManager = () => {
  const [savedSessions, setSavedSessions] = useState<SessionMetadata[]>([])
  const [recoverySession, setRecoverySession] = useState<SessionMetadata | null>(null)
  const [showRecoveryModal, setShowRecoveryModal] = useState(false)

  const loadSessions = useCallback(async () => {
    try {
      const sessions = await listAllSessions()
      setSavedSessions(sessions)
      console.log('📂 Loaded saved sessions:', sessions.length)

      // Check for incomplete sessions (crash recovery)
      const incompleteSessions = sessions.filter(s => !s.isCompleted && s.totalChunks > 0)
      if (incompleteSessions.length > 0) {
        const mostRecent = incompleteSessions.sort((a, b) => b.startTime - a.startTime)[0]
        console.log('🔄 Found incomplete session:', mostRecent.sessionId)
        setRecoverySession(mostRecent)
        setShowRecoveryModal(true)
      }
    } catch (err) {
      console.error('❌ Failed to load sessions:', err)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadSessions()
  }, [loadSessions])

  const deleteSession = async (sessionId: string) => {
    if (!confirm('このセッションを削除しますか？')) {
      return
    }

    try {
      const storage = new ChunkStorage(sessionId)
      await storage.deleteSession()
      await loadSessions()
      console.log('🗑️ Session deleted:', sessionId)
    } catch (err) {
      console.error('❌ Failed to delete session:', err)
      alert('Failed to delete session')
    }
  }

  const clearAllSessions = async () => {
    if (!confirm(`すべてのセッション (${savedSessions.length}件) を削除しますか？この操作は取り消せません。`)) {
      return
    }

    let successCount = 0
    let failCount = 0
    const errors: string[] = []

    for (const session of savedSessions) {
      try {
        console.log('🗑️ Deleting session:', session.sessionId)
        const storage = new ChunkStorage(session.sessionId)
        await storage.deleteSession()
        successCount++
        console.log('✅ Session deleted successfully:', session.sessionId)
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        console.error('❌ Failed to delete session:', session.sessionId, err)
        errors.push(`${session.sessionId}: ${errorMsg}`)
        failCount++
      }
    }

    await loadSessions()

    if (errors.length > 0) {
      console.error('削除エラーの詳細:', errors)
      alert(`削除完了: 成功 ${successCount}件, 失敗 ${failCount}件\n\nエラー詳細はコンソールを確認してください`)
    } else {
      alert(`削除完了: 成功 ${successCount}件`)
    }
  }

  const recoverSession = async (sessionId: string) => {
    try {
      const storage = new ChunkStorage(sessionId)
      await storage.completeSession()
      await loadSessions()
      console.log('✅ Session recovered:', sessionId)
      return true
    } catch (err) {
      console.error('❌ Failed to recover session:', err)
      alert('セッションの復元に失敗しました')
      return false
    }
  }

  const discardRecoverySession = async (sessionId: string) => {
    if (!confirm('このセッションを削除してもよろしいですか？この操作は取り消せません。')) {
      return false
    }

    try {
      const storage = new ChunkStorage(sessionId)
      await storage.deleteSession()
      await loadSessions()
      console.log('🗑️ Recovery session discarded:', sessionId)
      return true
    } catch (err) {
      console.error('❌ Failed to discard session:', err)
      alert('セッションの削除に失敗しました')
      return false
    }
  }

  return {
    savedSessions,
    recoverySession,
    showRecoveryModal,
    setShowRecoveryModal,
    setRecoverySession,
    loadSessions,
    deleteSession,
    clearAllSessions,
    recoverSession,
    discardRecoverySession,
  }
}
