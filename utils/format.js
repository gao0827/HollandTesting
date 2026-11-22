function pad(value) {
  return String(value).padStart(2, '0')
}

function formatDate(timestamp) {
  if (timestamp == null || timestamp === '') return '未知时间'
  const date = new Date(Number(timestamp))
  if (Number.isNaN(date.getTime())) return '未知时间'
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

module.exports = {
  formatDate
}
