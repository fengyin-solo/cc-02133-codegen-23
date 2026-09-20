import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    name: 'Home',
    component: () => import('@/views/HomeView.vue'),
    meta: { title: '首页' }
  },
  {
    path: '/about',
    name: 'About',
    component: () => import('@/views/AboutView.vue'),
    meta: { title: '关于我们' }
  },
  {
    path: '/products',
    name: 'Products',
    component: () => import('@/views/ProductView.vue'),
    meta: { title: '产品服务' }
  },
  {
    path: '/cases',
    name: 'Cases',
    component: () => import('@/views/CaseView.vue'),
    meta: { title: '案例展示' }
  },
  {
    path: '/contact',
    name: 'Contact',
    component: () => import('@/views/ContactView.vue'),
    meta: { title: '联系我们' }
  },
  {
    // 独立工具页：不改动任何原有产品页面
    path: '/estimator',
    name: 'Estimator',
    component: () => import('@/views/EstimatorView.vue'),
    meta: { title: '物流成本估算器' }
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) {
      return savedPosition
    }
    if (to.hash) {
      return { el: to.hash, behavior: 'smooth', top: 80 }
    }
    return { top: 0 }
  }
})

router.beforeEach((to, from, next) => {
  document.title = `${to.meta.title} - 广州知运信息技术有限公司`
  next()
})

export default router
