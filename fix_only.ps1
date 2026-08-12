$path = "d:\Projects\IS_SYSTEM\check_minuses_only.html"
$content = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)

$target1 = 'let completedOps = {};'
$repl1 = "let completedOps = {};
                  let manualOps = {};"
$content = $content.Replace($target1, $repl1)

$target2 = "grossCompletedOps[key] = (grossCompletedOps[key] || 0) + qty; " + "
                          }"
$repl2 = "grossCompletedOps[key] = (grossCompletedOps[key] || 0) + qty; " + "
                          }
                          if (r['Оператор'] === 'СИСТЕМА (Ръчно добавен)' || (r['Оператор'] === 'СИСТЕМА (Корекция наличност)' && qty > 0)) {
                              manualOps[key] = (manualOps[key] || 0) + qty;
                          }"
$content = $content.Replace($target2, $repl2)

$target3 = "let requiredFromMe = (grossCompletedOps[nextOpKey] || 0) + (scrappedOps[nextOpKey] || 0);
                        grossCompletedOps[opKey] = Math.max(grossCompletedOps[opKey] || 0, requiredFromMe);"
$repl3 = "let requiredFromMe = (grossCompletedOps[nextOpKey] || 0) + (scrappedOps[nextOpKey] || 0);
                        grossCompletedOps[opKey] = Math.max(grossCompletedOps[opKey] || 0, requiredFromMe);
                        let manualRequiredFromMe = manualOps[nextOpKey] || 0;
                        manualOps[opKey] = Math.max(manualOps[opKey] || 0, manualRequiredFromMe);"
$content = $content.Replace($target3, $repl3)

$target4 = "let firstOpKey = parentCode + '_' + String(parentRoutes[0]['Име на операция']).trim().toLowerCase();
                                parentConsumed = grossStartedOps[firstOpKey] || 0;"
$repl4 = "let firstOpKey = parentCode + '_' + String(parentRoutes[0]['Име на операция']).trim().toLowerCase();
                                parentConsumed = Math.max(0, (grossStartedOps[firstOpKey] || 0) - (manualOps[firstOpKey] || 0));"
$content = $content.Replace($target4, $repl4)

$utf8NoBom = New-Object System.Text.UTF8Encoding($False)
[System.IO.File]::WriteAllText($path, $content, $utf8NoBom)
