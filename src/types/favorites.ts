export interface FavoriteDevice {
  hostname: string
  label?: string
  addedAt: string
  position: number
}

export interface FavoriteSkill {
  /** Composite key: "rd::categoryId::cmdId" for Remote Doc or "qm::queryId" for Query Menu */
  skillId: string
  label: string
  category: string
  source: 'remote-doc' | 'query-menu'
  addedAt: string
  position: number
}

export interface FavoritesData {
  devices: FavoriteDevice[]
  skills: FavoriteSkill[]
}
