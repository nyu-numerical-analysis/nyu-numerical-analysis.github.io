-- {{< bi icon-name >}} → <i class="bi bi-icon-name"></i>
local function bi(args)
  local icon = pandoc.utils.stringify(args[1])
  return pandoc.RawInline('html', '<i class="bi bi-' .. icon .. '"></i>')
end

return { ['bi'] = bi }
