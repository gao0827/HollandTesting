const { getCase } = require('../../services/knowledge-service')

Page({
  data: { entry: null },

  onLoad({ id } = {}) {
    this.setData({ entry: getCase(id) })
  },

  copySource() {
    if (this.data.entry) wx.setClipboardData({ data: this.data.entry.source.url })
  }
})
