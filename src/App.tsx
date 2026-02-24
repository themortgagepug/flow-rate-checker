import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Home } from "@/pages/Home";
import { Toaster } from "sonner";

function App() {
  return (
    <BrowserRouter>
      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            background: "hsl(222 47% 11%)",
            border: "1px solid hsl(215 20% 25%)",
            color: "hsl(210 40% 98%)",
          },
        }}
      />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route
          path="*"
          element={
            <div className="min-h-screen gradient-background flex items-center justify-center">
              <div className="text-center">
                <h1 className="text-4xl font-bold text-foreground mb-4">404</h1>
                <p className="text-muted-foreground mb-6">Page not found</p>
                <a href="/" className="text-primary hover:underline">
                  Go home
                </a>
              </div>
            </div>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
