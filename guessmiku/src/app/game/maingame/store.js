"use client"

import { create } from 'zustand';

const useSelectedItemsStore = create((set) => ({
    selectedItems: [],
    addItem: (item) =>
        set((state) => ({
            selectedItems: [...state.selectedItems, item],
        })),
    removeItem: (id) =>
        set((state) => ({
            selectedItems: state.selectedItems.filter((item) => item.id !== id),
        })),
}));

export default useSelectedItemsStore;