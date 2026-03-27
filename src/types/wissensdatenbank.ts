export interface WBStep {
  title: string
  content: string
}

export interface WBArticle {
  id: string
  title: string
  description: string
  tags: string[]
  steps: WBStep[]
  relatedSkills: string[]
}

export interface WBSubcategory {
  id: string
  name: string
  articles: WBArticle[]
}

export interface WBCategory {
  id: string
  name: string
  icon: string
  subcategories: WBSubcategory[]
}

export interface WissensdatenbankData {
  meta: { version: string; generatedAt: string; totalArticles: number; totalCategories: number }
  categories: WBCategory[]
}

// Lightweight versions for list views (without full step content)
export interface WBCategorySummary {
  id: string
  name: string
  icon: string
  articleCount: number
  subcategories: { id: string; name: string; articleCount: number }[]
}

export interface WBArticleSummary {
  id: string
  title: string
  description: string
  tags: string[]
}

export interface WBSearchResult {
  id: string
  title: string
  description: string
  categoryName: string
  subcategoryName: string
  tags: string[]
}
