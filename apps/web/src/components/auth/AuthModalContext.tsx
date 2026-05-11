import { createContext, useContext, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";

interface AuthModalContextType {
  showSignIn: () => void;
  showSignUp: () => void;
  closeModal: () => void;
  openSignIn: () => void;
  openSignUp: () => void;
  isSignInOpen: boolean;
  isSignUpOpen: boolean;
}

const AuthModalContext = createContext<AuthModalContextType>({
  showSignIn: () => {}, showSignUp: () => {}, closeModal: () => {},
  openSignIn: () => {}, openSignUp: () => {},
  isSignInOpen: false, isSignUpOpen: false,
});

export function AuthModalProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();

  const showSignIn = () => navigate({ to: "/auth/sign-in" });
  const showSignUp = () => navigate({ to: "/auth/sign-up" });
  const closeModal = () => navigate({ to: "/" });

  return (
    <AuthModalContext.Provider value={{
      showSignIn, showSignUp, closeModal,
      openSignIn: showSignIn, openSignUp: showSignUp,
      isSignInOpen: false, isSignUpOpen: false,
    }}>
      {children}
    </AuthModalContext.Provider>
  );
}

export const useAuthModal = () => useContext(AuthModalContext);
export default AuthModalContext;
