const { DIMENSION_ORDER, RIASEC } = require('../../data/riasec')

Component({
  data: {
    types: DIMENSION_ORDER.map((code) => ({
      code,
      name: RIASEC[code].name,
      color: RIASEC[code].color,
      className: `node-${code.toLowerCase()}`
    }))
  }
})
