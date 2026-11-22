const { DIMENSION_ORDER } = require('../../data/riasec')

const directions = DIMENSION_ORDER.map((code, index) => ({
  code,
  angle: index * Math.PI / 3 - Math.PI / 2
}))

function point(angle, radius) {
  return { x: 50 + Math.cos(angle) * radius, y: 50 + Math.sin(angle) * radius }
}

function position({ x, y }) {
  return `left:${x}%;top:${y}%`
}

function line(from, to) {
  const dx = to.x - from.x
  const dy = to.y - from.y
  return `${position(from)};width:${Math.hypot(dx, dy)}%;transform:rotate(${Math.atan2(dy, dx)}rad)`
}

function edges(points) {
  return points.map((from, index) => line(from, points[(index + 1) % points.length]))
}

const radius = 36
const grid = [0.25, 0.5, 0.75, 1].flatMap((fraction) =>
  edges(directions.map(({ angle }) => point(angle, radius * fraction)))
).concat(directions.map(({ angle }) => line({ x: 50, y: 50 }, point(angle, radius))))

Component({
  properties: {
    dimensions: { type: Array, value: [] }
  },

  data: {
    rows: [],
    description: '',
    grid,
    axes: [],
    points: [],
    outline: [],
    polygon: '',
    hasCompass: false
  },

  observers: {
    dimensions(dimensions) {
      const rows = dimensions.filter((item) => item && Number.isFinite(item.rawScore)).map((item) => ({
        ...item,
        hasPercentage: Number.isFinite(item.percentage) && item.percentage >= 0 && item.percentage <= 100
      }))
      const high = Math.max(...rows.map((item) => item.rawScore))
      const leading = rows.filter((item) => item.rawScore === high)
      let description = ''
      if (rows.length > 1 && leading.length === rows.length) {
        description = `图中各维度均为 ${high} 分，可以从不同类型的活动各挑一项试做。`
      } else if (leading.length) {
        const names = leading.map((item) => item.name).join('、')
        description = `${names}${leading.length > 1 ? '并列' : ''}得分最高（${high} 分）。可先查看这些类型对应的活动，再结合其他维度理解你的兴趣。`
      }
      const axes = directions.map(({ code, angle }) => ({
        code,
        angle,
        style: position(point(angle, 46)),
        row: rows.find((item) => item.code === code)
      }))
      const hasCompass = axes.every(({ row }) => row?.hasPercentage)
      const vertices = hasCompass ? axes.map(({ angle, row }) => point(angle, radius * row.percentage / 100)) : []
      this.setData({
        rows,
        description,
        hasCompass,
        axes: axes.map(({ code, style, row }) => ({ code, style, color: row?.color || '' })),
        points: vertices.map((vertex, index) => ({
          code: axes[index].code,
          style: position(vertex),
          color: axes[index].row.color || '#6754a4'
        })),
        outline: edges(vertices).map((style, index) => ({ code: axes[index].code, style })),
        polygon: vertices.map(({ x, y }) => `${x}% ${y}%`).join(', ')
      })
    }
  }
})
