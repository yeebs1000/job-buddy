import { jobBuddyDb, type SavedView } from "./database";

export const savedViewRepository = {
  list: () => jobBuddyDb.savedViews.toArray(),
  get: (id: string) => jobBuddyDb.savedViews.get(id),
  save: (view: SavedView) => jobBuddyDb.savedViews.put(view),
  remove: (id: string) => jobBuddyDb.savedViews.delete(id),
};
