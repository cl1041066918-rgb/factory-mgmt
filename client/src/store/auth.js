import { create } from 'zustand';
import api from '../utils/api';

const useAuthStore = create((set, get) => ({
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  token: localStorage.getItem('token') || null,
  loading: false,

  login: async (username, password) => {
    set({ loading: true });
    try {
      const data = await api.post('/auth/login', { username, password });
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      set({ user: data.user, token: data.token, loading: false });
      return data;
    } catch (error) {
      set({ loading: false });
      throw error;
    }
  },

  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    set({ user: null, token: null });
  },

  hasPermission: (permission) => {
    const { user } = get();
    if (!user) return false;
    if (user.permissions.includes('*')) return true;
    return user.permissions.includes(permission);
  },

  isAdmin: () => {
    const { user } = get();
    return user?.role === 'admin';
  },

  getRole: () => {
    const { user } = get();
    return user?.role;
  },
}));

export default useAuthStore;
