$target1 = 'let completedOps = {}; let scrappedOps = {}; let grossCompletedOps = {};'
$repl1 = 'let completedOps = {}; let scrappedOps = {}; let grossCompletedOps = {}; let manualOps = {};'

$target2 = "if (r['Оператор'] !== 'СИСТЕМА (Експедиция)' && !(r['Оператор'] === 'СИСТЕМА (Корекция наличност)' && qty < 0) && op !== 'възстановен' && !op.startsWith('вложен в ')) {`r`n                            grossCompletedOps[key] = (grossCompletedOps[key]||0) + qty;`r`n                        }"
$repl2 = "if (r['Оператор'] !== 'СИСТЕМА (Експедиция)' && !(r['Оператор'] === 'СИСТЕМА (Корекция наличност)' && qty < 0) && op !== 'възстановен' && !op.startsWith('вложен в ')) {`r`n                            grossCompletedOps[key] = (grossCompletedOps[key]||0) + qty;`r`n                        }`r`n                        if (r['Оператор'] === 'СИСТЕМА (Ръчно добавен)' || (r['Оператор'] === 'СИСТЕМА (Корекция наличност)' && qty > 0)) {`r`n                            manualOps[key] = (manualOps[key]||0) + qty;`r`n                        }"

$target3 = "let requiredFromMe = (grossCompletedOps[nextOpKey] || 0) + (scrappedOps[nextOpKey] || 0);`r`n                        grossCompletedOps[opKey] = Math.max(grossCompletedOps[opKey] || 0, requiredFromMe);"
$repl3 = "let requiredFromMe = (grossCompletedOps[nextOpKey] || 0) + (scrappedOps[nextOpKey] || 0);`r`n                        grossCompletedOps[opKey] = Math.max(grossCompletedOps[opKey] || 0, requiredFromMe);`r`n                        let manualRequiredFromMe = manualOps[nextOpKey] || 0;`r`n                        manualOps[opKey] = Math.max(manualOps[opKey] || 0, manualRequiredFromMe);"

$target4 = "if (parentRoutes && parentRoutes.length > 0) {`r`n                                let firstOpKey = parentCode + '_' + String(parentRoutes[0]['Име на операция']).trim().toLowerCase();`r`n                                parentConsumed = grossStartedOps[firstOpKey] || 0;`r`n                            }"
$repl4 = "if (parentRoutes && parentRoutes.length > 0) {`r`n                                let firstOpKey = parentCode + '_' + String(parentRoutes[0]['Име на операция']).trim().toLowerCase();`r`n                                parentConsumed = Math.max(0, (grossStartedOps[firstOpKey] || 0) - (manualOps[firstOpKey] || 0));`r`n                            }"

function Fix-File {
    param($path)
    $content = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::Unicode)
    $content = $content.Replace($target1, $repl1)
    $content = $content.Replace($target2, $repl2)
    $content = $content.Replace($target3, $repl3)
    $content = $content.Replace($target4, $repl4)
    [System.IO.File]::WriteAllText($path, $content, [System.Text.Encoding]::Unicode)
}

Fix-File -path "d:\Projects\IS_SYSTEM\check_minuses.html"
Fix-File -path "d:\Projects\IS_SYSTEM\check_minuses_only.html"
