const storage = require('../../utils/storage')
const { parseAssessmentSelection, buildAssessmentUrl } = require('../../services/assessment-selection')
const { formatDate } = require('../../utils/format')

Page({
  data: {
    recordCount: 0,
    reportCount: 0,
    drafts: [],
    hasData: false,
    loadFailed: false
  },

  onShow() {
    this.loadData()
  },

  loadData() {
    try {
      const { recordCount, reportIds, drafts, hasData } = storage.getDataSummary()
      this.setData({
        recordCount,
        reportCount: reportIds.length,
        drafts: drafts.map((draft) => {
          const selection = parseAssessmentSelection(draft)
          return {
            id: storage.getDraftId(draft),
            label: selection.userTypeLabel || '旧版草稿',
            answered: Object.keys(draft.answers).length,
            updatedAt: formatDate(draft.updatedAt),
            url: buildAssessmentUrl(selection) || '/pages/selection/selection?assessmentType=standard'
          }
        }),
        hasData,
        loadFailed: false
      })
    } catch (error) {
      this.setData({ loadFailed: true })
    }
  },

  deleteDraft(event) {
    const { id } = event.currentTarget.dataset
    if (!this.data.drafts.some((draft) => draft.id === id)) return
    this.confirmDeletion({
      title: '删除这份答题草稿？',
      content: '删除后需要重新作答。其他草稿和已完成记录会保留。',
      action: () => storage.clearDraft(id)
    })
  },

  deleteAll() {
    if (!this.data.hasData || this.data.loadFailed) return
    this.confirmDeletion({
      title: '清除本机测评数据？',
      content: '本机的历史记录、报告和全部答题草稿将永久删除。',
      action: storage.clearAllData
    })
  },

  confirmDeletion({ title, content, action }) {
    wx.showModal({
      title,
      content,
      confirmText: '确认删除',
      confirmColor: '#be123c',
      success: ({ confirm }) => {
        if (!confirm) return
        try {
          action()
          this.loadData()
          wx.showToast({ title: '已删除', icon: 'success' })
        } catch (error) {
          wx.showToast({ title: '删除失败，请重试', icon: 'none' })
        }
      }
    })
  }
})
