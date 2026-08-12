$path = "d:\Projects\IS_SYSTEM\check_minuses_only.html"
$content = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)

# Target 2
$content = $content -replace 'grossCompletedOps\[key\] = \(grossCompletedOps\[key\] \|\| 0\) \+ qty;\s*\}', "grossCompletedOps[key] = (grossCompletedOps[key] || 0) + qty; 
                          }
                          if (r['Оператор'] === 'СИСТЕМА (Ръчно добавен)' || (r['Оператор'] === 'СИСТЕМА (Корекция наличност)' && qty > 0)) {
                              manualOps[key] = (manualOps[key] || 0) + qty;
                          }"

# Target 3
$content = $content -replace 'grossCompletedOps\[opKey\] = Math\.max\(grossCompletedOps\[opKey\] \|\| 0, requiredFromMe\);', "grossCompletedOps[opKey] = Math.max(grossCompletedOps[opKey] || 0, requiredFromMe);
                        let manualRequiredFromMe = manualOps[nextOpKey] || 0;
                        manualOps[opKey] = Math.max(manualOps[opKey] || 0, manualRequiredFromMe);"

# Target 4
$content = $content -replace 'parentConsumed = grossStartedOps\[firstOpKey\] \|\| 0;', "parentConsumed = Math.max(0, (grossStartedOps[firstOpKey] || 0) - (manualOps[firstOpKey] || 0));"

$utf8NoBom = New-Object System.Text.UTF8Encoding($False)
[System.IO.File]::WriteAllText($path, $content, $utf8NoBom)
