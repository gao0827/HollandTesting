const { getCareer, getDimension } = require('../../services/knowledge-service')

Page({
  data: {
    career: null,
    type: null,
    rolesText: ''
  },

  onLoad({ id } = {}) {
    const career = getCareer(id)
    if (!career) return
    this.setData({
      career,
      type: getDimension(career.dimension),
      rolesText: career.roles.join('、')
    })
  },

  copySource() {
    if (this.data.career) wx.setClipboardData({ data: this.data.career.source.url })
  }
})
