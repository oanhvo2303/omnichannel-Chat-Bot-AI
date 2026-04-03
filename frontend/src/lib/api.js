export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

export const authFetch = async (url, options = {}) => {
  if (typeof window === "undefined") return fetch(url, options); // SSR protection

  const token = localStorage.getItem("token");
  if (!token) {
    if (window.location.pathname !== "/login") {
      window.location.href = "/login";
    }
    return Promise.reject("No token");
  }

  const defaultHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  const finalOptions = {
    ...options,
    headers: { ...defaultHeaders, ...options.headers },
  };

  const response = await fetch(url, finalOptions);

  if (response.status === 401) {
    localStorage.removeItem("token");
    localStorage.removeItem("shop");
    if (window.location.pathname !== "/login") {
      window.location.href = "/login";
    }
  }

  return response;
};
