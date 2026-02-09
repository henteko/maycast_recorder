/**
 * LoadingScreen - ローディング画面
 */

interface LoadingScreenProps {
  message?: string;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({
  message = 'Loading...',
}) => {
  return (
    <div className="flex flex-col items-center justify-center h-full bg-maycast-bg text-maycast-text">
      <div className="relative">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-maycast-primary border-t-transparent" />
        <div className="absolute inset-0 animate-ping rounded-full h-12 w-12 border-4 border-maycast-primary/30" />
      </div>
      <p className="text-maycast-text-secondary mt-4 font-medium">{message}</p>
    </div>
  );
};
