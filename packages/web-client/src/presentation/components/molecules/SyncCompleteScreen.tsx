/**
 * SyncCompleteScreen - 同期完了画面
 */

export const SyncCompleteScreen: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center h-full bg-maycast-bg text-maycast-text">
      <div className="bg-maycast-safe/10 backdrop-blur-md p-12 rounded-2xl border border-maycast-safe/30 shadow-xl">
        <div className="flex flex-col items-center">
          <div className="text-6xl mb-4">✅</div>
          <h1 className="text-3xl font-bold mb-2 text-maycast-safe">録画完了!</h1>
          <p className="text-maycast-text-secondary mb-4">
            録画データのアップロードが完了しました。
          </p>
          <p className="text-maycast-text-secondary text-sm">
            このウィンドウを閉じても大丈夫です。
          </p>
        </div>
      </div>
    </div>
  );
};
