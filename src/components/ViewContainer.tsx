import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import Footer from "./Footer";

interface ViewContainerProps {
  children: ReactNode;
}

export default function ViewContainer({ children }: ViewContainerProps) {
  const location = useLocation();
  const isDashboard = location.pathname === "/";

  if (isDashboard) {
    return (
      <>
        {children}
        <Footer />
      </>
    );
  }

  return (
    <div
      className="relative z-[1] min-h-screen animate-fade-in"
      style={{
        background: "rgba(5,5,5,0.92)",
        backdropFilter: "blur(32px)",
        WebkitBackdropFilter: "blur(32px)",
      }}
    >
      <div className="mx-auto px-6 lg:px-12" style={{ maxWidth: 1280, paddingTop: 104 }}>
        {children}
      </div>
      <Footer />
    </div>
  );
}
