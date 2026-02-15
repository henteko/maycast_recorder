import { useMemo } from 'react';
import { BrowserRouter, Routes, Route, useParams } from 'react-router-dom';
import { DIProvider, setupContainer } from './infrastructure/di';
import { SoloPage } from './presentation/components/pages/SoloPage';
import { GuestPage } from './presentation/components/pages/GuestPage';
import { DirectorPage } from './presentation/components/pages/DirectorPage';
import { RoomDetailPage } from './presentation/components/pages/RoomDetailPage';
import { TopPage } from './presentation/components/pages/TopPage';

// Standalone Mode用のルーター
function SoloModeRouter() {
  const diContainer = useMemo(() => {
    return setupContainer('standalone');
  }, []);

  return (
    <DIProvider container={diContainer}>
      <SoloPage />
    </DIProvider>
  );
}

// Guest Mode用のルーター
function GuestModeRouter() {
  const { roomId } = useParams<{ roomId: string }>();

  const diContainer = useMemo(() => {
    return setupContainer('remote');
  }, []);

  if (!roomId) {
    return (
      <div className="flex items-center justify-center h-screen bg-maycast-bg text-maycast-text">
        <p>Room ID is required</p>
      </div>
    );
  }

  return (
    <DIProvider container={diContainer}>
      <GuestPage roomId={roomId} />
    </DIProvider>
  );
}

// Director Mode用のルーター
function DirectorModeRouter() {
  const diContainer = useMemo(() => {
    return setupContainer('remote');
  }, []);

  return (
    <DIProvider container={diContainer}>
      <DirectorPage />
    </DIProvider>
  );
}

// Room Detail用のルーター
function RoomDetailModeRouter() {
  const diContainer = useMemo(() => {
    return setupContainer('remote');
  }, []);

  return (
    <DIProvider container={diContainer}>
      <RoomDetailPage />
    </DIProvider>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Standalone Mode - /solo */}
        <Route path="/solo" element={<SoloModeRouter />} />

        {/* Director Mode - /director */}
        <Route path="/director" element={<DirectorModeRouter />} />

        {/* Room Detail - /director/rooms/:roomId */}
        <Route path="/director/rooms/:roomId" element={<RoomDetailModeRouter />} />

        {/* Guest Mode - /guest/:roomId */}
        <Route path="/guest/:roomId" element={<GuestModeRouter />} />

        {/* Top Page */}
        <Route path="/" element={<TopPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
