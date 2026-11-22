const { getDimension, listDimensions, listCareers, listCases } = require('../../services/knowledge-service')

Page({
  data: {
    types: listDimensions(),
    selectedType: null,
    careers: [],
    cases: listCases()
  },

  onLoad({ type } = {}) {
    this.applyFilter(type)
  },

  selectType(event) {
    this.applyFilter(event.currentTarget.dataset.code)
  },

  applyFilter(code) {
    const selectedType = getDimension(code)
    this.setData({ selectedType, careers: listCareers(code) })
  }
})
